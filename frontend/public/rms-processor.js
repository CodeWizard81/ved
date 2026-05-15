class RMSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        
        if (this.bufferIndex >= this.bufferSize) {
          let sumSquares = 0;
          for (let j = 0; j < this.bufferSize; j++) {
            sumSquares += this.buffer[j] * this.buffer[j];
          }
          const rms = Math.sqrt(sumSquares / this.bufferSize);
          this.port.postMessage(rms);
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('rms-processor', RMSProcessor);
