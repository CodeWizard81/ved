"""
V.E.D. Tool Execution Engine
----------------------------
Defines all tools available to V.E.D. via Groq Function Calling.
Add new tools here and register them in TOOLS_SCHEMA + TOOL_REGISTRY.
"""
import json
import datetime
import requests
import openmeteo_requests
import requests_cache
import pandas as pd
from retry_requests import retry

# ---------------------------------------------------------------------------
# Shared Open-Meteo client (cached 1hr, auto-retry)
# ---------------------------------------------------------------------------
_cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
_retry_session = retry(_cache_session, retries=5, backoff_factor=0.2)
_openmeteo = openmeteo_requests.Client(session=_retry_session)


# ---------------------------------------------------------------------------
# Tool Implementations
# ---------------------------------------------------------------------------

def get_current_time() -> str:
    """Returns the current local date and time."""
    now = datetime.datetime.now()
    return now.strftime("Today is %A, %B %d, %Y. The current time is %I:%M %p.")


def get_weather(location: str) -> str:
    """
    Fetches comprehensive weather (current + today's hourly + 7-day daily)
    for a given location using Open-Meteo and geocoding APIs.
    """
    # --- Step 1: Geocode ---
    try:
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
        geo_resp = requests.get(geo_url, timeout=10)
        geo_data = geo_resp.json()
        if not geo_data.get("results"):
            return f"I couldn't find the location '{location}'. Try a more specific city name."
        r = geo_data["results"][0]
        lat, lon = r["latitude"], r["longitude"]
        city_name = r.get("name", location)
        country   = r.get("country", "")
    except Exception as e:
        return f"Geocoding failed for '{location}': {e}"

    # --- Step 2: Fetch full weather data ---
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "auto",
        "current": [
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "is_day", "wind_gusts_10m", "wind_direction_10m", "wind_speed_10m",
            "snowfall", "showers", "rain", "weather_code", "cloud_cover",
            "pressure_msl", "precipitation", "surface_pressure"
        ],
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "precipitation_probability", "precipitation", "weather_code",
            "cloud_cover", "visibility", "wind_speed_10m"
        ],
        "daily": [
            "weather_code", "temperature_2m_max", "temperature_2m_min",
            "apparent_temperature_max", "apparent_temperature_min",
            "sunrise", "sunset", "daylight_duration", "sunshine_duration",
            "uv_index_max", "rain_sum", "precipitation_sum",
            "precipitation_probability_max", "wind_speed_10m_max",
            "wind_gusts_10m_max", "wind_direction_10m_dominant"
        ],
    }

    try:
        responses = _openmeteo.weather_api(url, params=params)
        response = responses[0]

        tz_label = response.Timezone().decode() if response.Timezone() else "UTC"

        # --- Current conditions ---
        current = response.Current()
        c_temp        = round(current.Variables(0).Value(), 1)
        c_humidity    = round(current.Variables(1).Value(), 1)
        c_feels       = round(current.Variables(2).Value(), 1)
        c_is_day      = bool(current.Variables(3).Value())
        c_wind_gust   = round(current.Variables(4).Value(), 1)
        c_wind_dir    = round(current.Variables(5).Value(), 0)
        c_wind_speed  = round(current.Variables(6).Value(), 1)
        c_snowfall    = round(current.Variables(7).Value(), 1)
        c_showers     = round(current.Variables(8).Value(), 1)
        c_rain        = round(current.Variables(9).Value(), 1)
        c_wmo         = int(current.Variables(10).Value())
        c_cloud       = round(current.Variables(11).Value(), 0)
        c_pressure    = round(current.Variables(12).Value(), 1)
        c_precip      = round(current.Variables(13).Value(), 1)
        c_condition   = _wmo_code_to_description(c_wmo)
        daytime_str   = "daytime" if c_is_day else "nighttime"

        # --- Hourly snapshot (next 6 hours) ---
        hourly = response.Hourly()
        h_times  = pd.date_range(
            start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
            end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
            freq=pd.Timedelta(seconds=hourly.Interval()),
            inclusive="left"
        ).tz_convert(tz_label)
        h_temp    = hourly.Variables(0).ValuesAsNumpy()
        h_precip_prob = hourly.Variables(3).ValuesAsNumpy()
        h_wmo     = hourly.Variables(5).ValuesAsNumpy()

        hourly_summary_parts = []
        for i in range(min(6, len(h_times))):
            hour_label = h_times[i].strftime("%I %p").lstrip("0")
            cond = _wmo_code_to_description(int(h_wmo[i]))
            hourly_summary_parts.append(
                f"{hour_label}: {round(h_temp[i], 1)}°C, {cond}, {int(h_precip_prob[i])}% rain chance"
            )
        hourly_summary = " | ".join(hourly_summary_parts)

        # --- Daily forecast (next 7 days) ---
        daily = response.Daily()
        d_times  = pd.date_range(
            start=pd.to_datetime(daily.Time(), unit="s", utc=True),
            end=pd.to_datetime(daily.TimeEnd(), unit="s", utc=True),
            freq=pd.Timedelta(seconds=daily.Interval()),
            inclusive="left"
        ).tz_convert(tz_label)
        d_wmo       = daily.Variables(0).ValuesAsNumpy()
        d_max       = daily.Variables(1).ValuesAsNumpy()
        d_min       = daily.Variables(2).ValuesAsNumpy()
        d_uv        = daily.Variables(9).ValuesAsNumpy()
        d_rain_sum  = daily.Variables(10).ValuesAsNumpy()
        d_precip_prob_max = daily.Variables(12).ValuesAsNumpy()

        daily_summary_parts = []
        for i in range(min(7, len(d_times))):
            day_label = d_times[i].strftime("%A")
            cond = _wmo_code_to_description(int(d_wmo[i]))
            daily_summary_parts.append(
                f"{day_label}: {cond}, {round(d_max[i],1)}°/{round(d_min[i],1)}°C, "
                f"UV {round(d_uv[i],1)}, {int(d_precip_prob_max[i])}% rain"
            )
        daily_summary = " | ".join(daily_summary_parts)

        # --- Compose voice-friendly response ---
        return (
            f"Weather in {city_name}, {country} ({tz_label}, {daytime_str}): "
            f"{c_condition}. {c_temp}°C, feels like {c_feels}°C. "
            f"Humidity {c_humidity}%, cloud cover {c_cloud}%, pressure {c_pressure} hPa. "
            f"Wind {c_wind_speed} km/h, gusts up to {c_wind_gust} km/h. "
            f"Precipitation: {c_precip} mm. "
            f"\nNext 6 hours: {hourly_summary}. "
            f"\n7-day forecast: {daily_summary}."
        )

    except Exception as e:
        return f"Failed to fetch weather data for '{location}': {e}"


def _wmo_code_to_description(code: int) -> str:
    """Maps WMO Weather Interpretation Code to a human-readable string."""
    WMO_CODES = {
        0: "Clear sky",
        1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        56: "Light freezing drizzle", 57: "Heavy freezing drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        66: "Light freezing rain", 67: "Heavy freezing rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        77: "Snow grains",
        80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
        85: "Slight snow showers", 86: "Heavy snow showers",
        95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
    }
    return WMO_CODES.get(code, f"Unknown conditions (WMO {code})")


# ---------------------------------------------------------------------------
# Tool Registry & Schema (sent to Groq API)
# ---------------------------------------------------------------------------

TOOL_REGISTRY = {
    "get_current_time": get_current_time,
    "get_weather": get_weather,
}

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Returns the current local date and time. Use this whenever the user asks what time or date it is.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Fetches comprehensive weather for a city: current conditions, "
                "next 6-hour hourly breakdown, and a 7-day daily forecast including "
                "UV index, precipitation probability, wind, and temperature highs/lows. "
                "Use this whenever the user asks about weather, forecast, rain, UV, or temperature."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The name of the city or location, e.g. 'Tokyo', 'New York', 'Mumbai'."
                    }
                },
                "required": ["location"]
            }
        }
    }
]


def execute_tool(tool_name: str, tool_args: dict) -> str:
    """Looks up and executes a tool by name, returning the string result."""
    func = TOOL_REGISTRY.get(tool_name)
    if not func:
        return f"Error: Tool '{tool_name}' not found."
    try:
        return func(**tool_args)
    except Exception as e:
        return f"Error executing tool '{tool_name}': {e}"
