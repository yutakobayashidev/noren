flake: { config, lib, pkgs, ... }:
let cfg = config.services.flare-web;
in {
  options.services.flare-web = {
    enable = lib.mkEnableOption "Flare Web";
    package = lib.mkOption { type = lib.types.package; default = flake.packages.${pkgs.stdenv.hostPlatform.system}.default.override { plugins = cfg.plugins; }; };
    plugins = lib.mkOption { type = lib.types.listOf lib.types.path; default = []; description = "Directories containing Flare API v2 post actions."; };
    port = lib.mkOption { type = lib.types.port; default = 3101; };
    host = lib.mkOption { type = lib.types.str; default = "127.0.0.1"; };
    settings = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = {}; description = "Public settings, including APP_ORIGIN, OIDC_ISSUER and OIDC_CLIENT_ID."; };
    environmentFile = lib.mkOption { type = lib.types.nullOr lib.types.path; default = null; description = "Runtime secret file, e.g. sops dotenv; do not copy secrets into the Nix store."; };
  };
  config = lib.mkIf cfg.enable {
    systemd.services.flare-web = {
      description = "Flare Web";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      environment = cfg.settings // { HOST = cfg.host; PORT = toString cfg.port; FLARE_DATA_DIR = "/var/lib/flare-web"; };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        StateDirectory = "flare-web";
        StateDirectoryMode = "0700";
        UMask = "0077";
        Restart = "on-failure";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
      } // lib.optionalAttrs (cfg.environmentFile != null) { EnvironmentFile = cfg.environmentFile; };
    };
  };
}
