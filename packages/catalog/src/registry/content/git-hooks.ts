export const lefthookYamlContents = `pre-commit:
  parallel: false
  commands:{{#if format=biome}}
    format:
      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"
      run: "{{packageManager}} run git-hooks:format -- {staged_files}"
      stage_fixed: true{{/if}}{{#if format=oxfmt}}
    format:
      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"
      run: "{{packageManager}} run git-hooks:format -- {staged_files}"
      stage_fixed: true{{/if}}{{#if lint=biome}}
    lint:
      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"
      run: "{{packageManager}} run git-hooks:lint -- {staged_files}"
      stage_fixed: true{{/if}}{{#if lint=oxlint}}
    lint:
      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"
      run: "{{packageManager}} run git-hooks:lint -- {staged_files}"
      stage_fixed: true{{/if}}
`;

export const huskyPreCommitContents = `{{packageManager}} run lint-staged
`;

export const lintStagedConfigContents = `export default {
  "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}": [{{#if format=biome}}
    "{{packageManager}} run git-hooks:format --",{{/if}}{{#if format=oxfmt}}
    "{{packageManager}} run git-hooks:format --",{{/if}}{{#if lint=biome}}
    "{{packageManager}} run git-hooks:lint --",{{/if}}{{#if lint=oxlint}}
    "{{packageManager}} run git-hooks:lint --",{{/if}}
  ],
};
`;
