{
  description = "{{projectName}} development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        {{#if runtime=node}}"x86_64-darwin"
        {{/if}}{{#if runtime=deno}}"x86_64-darwin"
        {{/if}}"aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              {{#if runtime=bun}}bun
              {{/if}}{{#if runtime=deno}}deno
              {{/if}}{{#if runtime=bun}}nodejs_24
              {{/if}}{{#if runtime=node}}nodejs_24
              {{/if}}
              git
            ];

            shellHook = ''
              {{#if runtime=bun}}echo "Bun $(bun --version)"
              echo "Node $(node --version)"{{/if}}{{#if runtime=node}}echo "Node $(node --version)"{{/if}}{{#if runtime=deno}}echo "Deno $(deno --version | head -n 1)"{{/if}}
            '';
          };
        }
      );
    };
}
