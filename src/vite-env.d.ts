/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs'
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
