// Compile the Decap-managed album notes into a single JSON the player fetches:
//   { "<album title>": "<rendered note HTML>", ... }
// Only albums with a non-empty note are included; the player falls back to the
// track/minutes line for the rest.
module.exports = class {
  data() {
    return {
      permalink: "/assets/catalogs/album-notes.json",
      eleventyExcludeFromCollections: true,
    };
  }
  render({ collections }) {
    const notes = {};
    for (const item of collections.albumNotes || []) {
      const album = item.data && item.data.album;
      const html = (item.templateContent || "").trim();
      if (album && html) notes[album] = html;
    }
    return JSON.stringify(notes);
  }
};
