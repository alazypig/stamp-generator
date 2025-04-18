/// <reference types="vite/client" />
export { }

declare global {
  interface Window {
    opencvReady: boolean
    cv: Promise<object>
  }
}


