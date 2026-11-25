/**
 * The narrow surface `electron/preload.cjs` exposes to the renderer. Absent in
 * a browser, so every caller has to work without it.
 */
export interface FlowstateBridge {
  platform: string
  saveFile(input: { suggestedName: string; mimeType?: string; data: ArrayBuffer }): Promise<{
    ok: boolean
    reason?: string
    filePath?: string
  }>
  printHtml(input: { html: string; title: string }): Promise<{ ok: boolean; reason?: string }>
}

declare global {
  interface Window {
    flowstate?: FlowstateBridge
  }
}
