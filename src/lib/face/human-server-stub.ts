// Server render never runs face detection. The browser bundle aliases
// @vladmandic/human to the real ESM build.
export default class Human {
  constructor(_config: object) {}
  async load(): Promise<void> {}
  async detect(): Promise<{ face: [] }> {
    return { face: [] };
  }
}
