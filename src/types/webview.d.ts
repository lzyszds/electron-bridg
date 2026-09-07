import type { WebviewTag } from 'electron'

/* eslint-disable @typescript-eslint/no-namespace */
declare module 'react' {
  namespace JSX {
    interface WebviewAttributes {
      src?: string
      preload?: string
      useragent?: string
      partition?: string
      allowpopups?: boolean
      webpreferences?: string
    }

    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<WebviewTag> & WebviewAttributes,
        WebviewTag
      >
    }
  }
}

export type { WebviewTag }