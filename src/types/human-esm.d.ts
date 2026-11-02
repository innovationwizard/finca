declare module "@vladmandic/human" {
  export default class Human {
    constructor(config: object);
    load(): Promise<void>;
    detect(input: HTMLVideoElement | HTMLCanvasElement): Promise<{
      face: { embedding?: number[]; score?: number; boxScore?: number }[];
    }>;
  }
}
