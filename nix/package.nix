{ lib, stdenv, nodejs_24, pnpm_10, fetchPnpmDeps, pnpmConfigHook, makeWrapper, esbuild, plugins ? [] }:
stdenv.mkDerivation (finalAttrs: {
  pname = "noren";
  version = "0.1.0";
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let name = baseNameOf path; in
      !(builtins.elem name [ ".git" "node_modules" "dist" ".data" ".playwright-mcp" "test-results" "playwright-report" ".astro" ".agents" ".aws" ".codex" "z-ai" ])
      && !(lib.hasPrefix ".env" name);
  };
  nativeBuildInputs = [ nodejs_24 pnpm_10 pnpmConfigHook makeWrapper esbuild ];
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-u6E71flYOuoag14ROie2mV6dPirtMDpjhC25HhNwv38=";
  };
  preBuild = lib.concatImapStringsSep "\n" (i: plugin: let src = lib.escapeShellArg (builtins.toString (if builtins.isPath plugin then builtins.path { path = plugin; name = "flare-plugin"; } else plugin)); in ''
    mkdir plugins/external-${toString i}
    for file in manifest.json action.js; do
      test -f ${src}/"$file" && test ! -L ${src}/"$file" || exit 1
      cp ${src}/"$file" plugins/external-${toString i}/
    done
  '') plugins;
  buildPhase = ''
    runHook preBuild
    pnpm build
    esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outfile=noren-server.mjs
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/flare-web $out/bin
    runtimeDeps=$(mktemp -d)
    cp -r package.json pnpm-lock.yaml pnpm-workspace.yaml patches "$runtimeDeps/"
    pnpm --dir "$runtimeDeps" install --prod --offline --frozen-lockfile --ignore-scripts
    cp -r dist noren-server.mjs package.json "$runtimeDeps/node_modules" $out/lib/flare-web/
    makeWrapper ${nodejs_24}/bin/node $out/bin/noren \
      --add-flags "$out/lib/flare-web/noren-server.mjs" \
      --set NODE_ENV production \
      --chdir "$out/lib/flare-web" \
      --run 'export FLARE_DATA_DIR="''${FLARE_DATA_DIR:-''${XDG_STATE_HOME:-$HOME/.local/state}/flare-web}"'
    ln -s noren $out/bin/flare-web
    runHook postInstall
  '';
  meta = { description = "Noren social Web client"; license = lib.licenses.agpl3Only; mainProgram = "noren"; platforms = lib.platforms.unix; };
})
