type SitePage = { slug: string; title: string; file: string };

const defineSitePages = (pages: Record<string, SitePage>) =>
  Object.values(pages);

export const sitePages = defineSitePages({});
