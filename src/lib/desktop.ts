export type DesktopResult = { ok?: boolean; canceled?: boolean; error?: string; name?: string };
declare global {
  interface Window {
    eisaxDesktop?: {
      open(): Promise<DesktopResult>;
      fullscreen(value?: boolean): Promise<boolean>;
      onFullscreenChange(callback: (value: boolean) => void): () => void;
      save(projectId: string, format: "docx" | "pptx" | "pdf", title: string, saveAs: boolean): Promise<DesktopResult>;
    };
  }
}
export {};
