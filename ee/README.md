# ee/ — Ostrom Enterprise features of the web console

Code here is under the Ostrom Enterprise License ([`LICENSE`](LICENSE)), not the AGPL: readable and
patchable, but production use needs a valid key. Delete this folder and the console still builds and runs;
the enterprise screens are simply absent. `src/` never imports `@ee/*` statically: enterprise screens are
registered through a single lazy entry point.
