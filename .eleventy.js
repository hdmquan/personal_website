// Imports
const pluginEleventyNavigation = require("@11ty/eleventy-navigation");
const pluginMinifier = require("@sherby/eleventy-plugin-files-minifier");
const pluginSitemap = require("@quasibit/eleventy-plugin-sitemap");

// Configs
const configCss = require("./src/config/css");
const configJs = require("./src/config/javascript");
const configSitemap = require("./src/config/sitemap");
const configServer = require("./src/config/server");

// Other
const filterPostDate = require("./src/config/postDate");
const isProduction = configServer.isProduction;

module.exports = function (eleventyConfig) {
    // Add Template Formats
    eleventyConfig.addTemplateFormats("css");
    eleventyConfig.addExtension("css", configCss);

    eleventyConfig.addTemplateFormats("js");
    eleventyConfig.addExtension("js", configJs);

    // Add Plugins
    eleventyConfig.addPlugin(pluginEleventyNavigation);
    eleventyConfig.addPlugin(pluginSitemap, configSitemap);

    if (isProduction) {
        eleventyConfig.addPlugin(pluginMinifier);
    }

    // Passthrough Copy
    eleventyConfig.addPassthroughCopy("./src/assets");
    eleventyConfig.addPassthroughCopy("./src/admin");
    eleventyConfig.addPassthroughCopy("./src/_redirects");

    // Add Filters
    eleventyConfig.addFilter("postDate", filterPostDate);

    // Add Shortcodes
    eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

    // Add Custom Collections
    eleventyConfig.addCollection("blog", (collectionApi) => {
        return collectionApi.getFilteredByGlob("src/content/blog/*.md").reverse(); // Reverse for newest first
    });

    eleventyConfig.addCollection("project", (collectionApi) => {
        return collectionApi.getFilteredByGlob("src/content/project/*.md").reverse(); // Reverse for newest first
    });

    eleventyConfig.addCollection("songs", (collectionApi) => {
        return collectionApi.getFilteredByGlob("src/content/songs/*.md").reverse(); // Reverse for newest first
    });

    // Set Server Options
    eleventyConfig.setServerOptions(configServer);

    // Return Configuration
    return {
        dir: {
            input: "src",
            output: "public",
            includes: "_includes",
            data: "_data",
        },
        htmlTemplateEngine: "njk", // Use Nunjucks for HTML templates
    };
};
