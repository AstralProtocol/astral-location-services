/// <reference types="vite/client" />

declare module '*.mjs' {
  const value: any;
  export default value;
  export const createClient: any;
  export const runAll: any;
  export const runSuite: any;
  export const loadOnchainSuites: any;
}
