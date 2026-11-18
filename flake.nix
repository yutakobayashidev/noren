{
  description = "Flare Android-inspired Web client — React, TypeScript and OIDC";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/168543c3491074de451852748ac9b310dad0021a";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      eachSystem = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in {
      packages = eachSystem (pkgs: {
        default = pkgs.callPackage ./nix/package.nix { };
      });
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_24 pkgs.pnpm_10 ];
          shellHook = ''
            export PNPM_HOME="$PWD/.data/pnpm"
          '';
        };
      });
      nixosModules.default = import ./nix/module.nix self;
    };
}
