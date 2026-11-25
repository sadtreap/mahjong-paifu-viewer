const CO_AUTHOR = /^\s*co-authored-by\s*:/im;

export default {
  extends: ["@commitlint/config-conventional"],
  // The default ignores (merge, revert, fixup! ...) skip every rule, including no-co-authors.
  // Re-create them here, but never for a message that carries a co-author trailer.
  defaultIgnores: false,
  ignores: [
    (message) =>
      /^(Merge |Revert "|Reapply "|(fixup|squash|amend)! )/.test(message) &&
      !CO_AUTHOR.test(message),
  ],
  plugins: [
    {
      rules: {
        "no-co-authors": ({ raw }) => [
          !CO_AUTHOR.test(raw ?? ""),
          "Co-authored-by trailers are not allowed",
        ],
      },
    },
  ],
  rules: {
    // Do not hard-wrap commit messages: header, body and footer lines may be any length.
    "header-max-length": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "no-co-authors": [2, "always"],
  },
};
