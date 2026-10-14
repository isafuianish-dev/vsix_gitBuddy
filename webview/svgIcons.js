/* Inline SVG icon strings shared across webview panels. All use currentColor so they inherit theme colours. */

const svgIcons = {
  SETTINGS: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M9.1 1.4c-.1-.3-.4-.5-.7-.5H7.6c-.3 0-.6.2-.7.5l-.3 1.2c-.4.1-.7.3-1 .5l-1.2-.4c-.3-.1-.6 0-.8.3l-.7 1.2c-.2.3-.1.6.1.8l.9.9c0 .2-.1.4-.1.6s0 .4.1.6l-.9.9c-.2.2-.3.5-.1.8l.7 1.2c.2.3.5.4.8.3l1.2-.4c.3.2.6.4 1 .5l.3 1.2c.1.3.4.5.7.5h1.2c.3 0 .6-.2.7-.5l.3-1.2c.4-.1.7-.3 1-.5l1.2.4c.3.1.6 0 .8-.3l.7-1.2c.2-.3.1-.6-.1-.8l-.9-.9c0-.2.1-.4.1-.6s0-.4-.1-.6l.9-.9c.2-.2.3-.5.1-.8l-.7-1.2c-.2-.3-.5-.4-.8-.3l-1.2.4c-.3-.2-.6-.4-1-.5L9.1 1.4zM8 10.5A2.5 2.5 0 1 1 8 5.5a2.5 2.5 0 0 1 0 5z"/></svg>`,
  REFRESH: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M13.65 2.35a7 7 0 1 0 1.7 7.15h-1.55a5.5 5.5 0 1 1-1.19-5.86L10 6.5h5V1.5l-1.35.85z"/></svg>`,
  COPY: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M4 4h7v1H5v9h7V8h1v7H4V4zm3-3h8v8h-1V2H7V1z"/></svg>`,
  CHECK: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="#3fb950" d="M6.5 12L2 7.5 3.06 6.44 6.5 9.88 12.94 3.44 14 4.5z"/></svg>`,
  GIT_LOG: `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM4 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm.5-4v4h-1V6h1zM11 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4.5-.5H9v1H6.5v-1z"/></svg>`,
  CHEVRON_DOWN: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M4 6l4 4 4-4H4z"/></svg>`,
  CHEVRON_RIGHT: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M6 4l4 4-4 4V4z"/></svg>`,
  GROUP_CHEVRON: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`,
  EXTERNAL_LINK: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M9 1h6v6h-1.5V3.56L7.06 10 6 8.94 12.44 2.5H9V1zM3 3h5v1.5H3v8h8V8H12v6H3a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 3 3z"/></svg>`,
  BRANCH: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11 3a2 2 0 1 1-2.75 1.86A3 3 0 0 1 6 7v.17a2 2 0 1 1-1 0V4.83a2 2 0 1 1 1 0V5a2 2 0 0 0 2-2 2 2 0 0 1 3-2.94A2 2 0 0 1 11 3zM5.5 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM11 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>`,
  MERGE: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M5 3.5a1.5 1.5 0 1 1-1 2.6v3.8A1.5 1.5 0 1 1 3 12.5v-7A1.5 1.5 0 0 1 4 3.9a1.5 1.5 0 0 1 1-.4zM11 10a1.5 1.5 0 1 1-.9 2.7C9.06 12 8 10.7 8 9V6.4a1.5 1.5 0 1 1 1 0V9c0 .9.6 1.6 1.4 1.9A1.5 1.5 0 0 1 11 10z"/></svg>`,
  CLOSE: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M4.3 3.3L8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3z"/></svg>`,
  SEARCH: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 4.5 4.5zm-.86 3.79 3.79 3.79-.85.85-3.79-3.79A5.48 5.48 0 0 1 6.5 12 5.5 5.5 0 1 1 12 6.5a5.48 5.48 0 0 1-1.86 4.13z"/></svg>`,
  TAG: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M2 2h6l7 7-7 7-7-7V2zm3 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`,
  STASH: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M2 4h12v2H2V4zm1 3h10l-1 6H4L3 7zm3 1.5v3h1v-3H6zm2 0v3h1v-3H8z"/></svg>`,
  FILE: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-4-4zm0 1.5L11.5 5H9V2.5zM4 2h4v4h4v8H4V2z"/></svg>`,
  FOLDER: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M1 3h5l1.5 2H15v8H1V3zm1 1v8h12V6H6.9L5.4 4H2z"/></svg>`,
  HELP: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5V10h1.5v1.5zM8.9 8.6c-.25.15-.4.3-.4.65v.25h-1.4v-.4c0-.7.3-1.15.85-1.5.5-.3.75-.55.75-1 0-.5-.4-.8-1-.8-.55 0-.95.25-1.3.7l-1-1c.5-.7 1.35-1.2 2.4-1.2 1.35 0 2.3.8 2.3 2 0 .8-.4 1.3-1.2 1.8z"/></svg>`,
};

module.exports = svgIcons;
