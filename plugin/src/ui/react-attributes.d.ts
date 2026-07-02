import "react";

// `webkitdirectory` is non-standard and missing from React's typings;
// React 16+ passes unknown lowercase attributes through to the DOM.
declare module "react" {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
