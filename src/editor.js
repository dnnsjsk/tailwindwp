(function () {
  const { addFilter } = wp.hooks;
  const { createHigherOrderComponent } = wp.compose;
  const { Fragment, createElement, useState, useEffect } = wp.element;
  const { InspectorControls } = wp.blockEditor;
  const { PanelBody, TextControl } = wp.components;
  const { useSelect, useDispatch, subscribe } = wp.data;

  // Debounce helper
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Style element for dynamic CSS (injected into editor iframe)
  let styleElement = null;
  let lastIframeDoc = null;

  function getEditorIframe() {
    // WordPress 6.x uses an iframe named "editor-canvas" for the block editor
    return document.querySelector('iframe[name="editor-canvas"]');
  }

  function getStyleElement() {
    const iframe = getEditorIframe();
    const targetDoc = iframe?.contentDocument || document;

    // If iframe changed or style element doesn't exist, create new one
    if (targetDoc !== lastIframeDoc || !styleElement || !targetDoc.contains(styleElement)) {
      lastIframeDoc = targetDoc;
      styleElement = targetDoc.createElement("style");
      styleElement.id = "tailwindwp-editor-styles";
      targetDoc.head.appendChild(styleElement);
    }

    return styleElement;
  }

  // Fetch CSS from API
  async function fetchTailwindCSS(classes) {
    if (!classes.length) {
      getStyleElement().textContent = "";
      return;
    }

    try {
      const response = await fetch(tailwindwpConfig.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": tailwindwpConfig.nonce,
        },
        body: JSON.stringify({
          classes: classes,
          scope: ".editor-styles-wrapper",
          minify: false,
        }),
      });

      const data = await response.json();

      if (data.success && data.css) {
        getStyleElement().textContent = data.css;
      }
    } catch (error) {
      console.error("TailwindWP: Failed to fetch CSS", error);
    }
  }

  // Debounced fetch
  const debouncedFetchCSS = debounce(fetchTailwindCSS, 300);

  // Collect all Tailwind classes from all blocks
  function collectAllClasses(blocks) {
    let classes = [];

    blocks.forEach((block) => {
      // Get tailwindClasses attribute
      if (block.attributes && block.attributes.tailwindClasses) {
        const blockClasses = block.attributes.tailwindClasses.split(" ");
        classes = classes.concat(blockClasses);
      }

      // Also get className (Additional CSS classes)
      if (block.attributes && block.attributes.className) {
        const classNames = block.attributes.className.split(" ");
        classes = classes.concat(classNames);
      }

      // Recurse into inner blocks
      if (block.innerBlocks && block.innerBlocks.length) {
        classes = classes.concat(collectAllClasses(block.innerBlocks));
      }
    });

    // Return unique non-empty classes
    return [...new Set(classes.filter((c) => c.trim()))];
  }

  // Subscribe to block changes and update CSS
  let lastClasses = [];

  subscribe(() => {
    const blocks = wp.data.select("core/block-editor").getBlocks();
    const classes = collectAllClasses(blocks);

    // Only fetch if classes changed
    const classesStr = classes.sort().join(" ");
    const lastClassesStr = lastClasses.sort().join(" ");

    if (classesStr !== lastClassesStr) {
      lastClasses = [...classes];
      debouncedFetchCSS(classes);
    }
  });

  // Add tailwindClasses attribute to all blocks
  addFilter(
    "blocks.registerBlockType",
    "tailwindwp/add-attributes",
    function (settings) {
      if (!settings.attributes) {
        settings.attributes = {};
      }

      settings.attributes.tailwindClasses = {
        type: "string",
        default: "",
      };

      return settings;
    }
  );

  // Add Tailwind Classes panel to block inspector
  const withTailwindClasses = createHigherOrderComponent(function (
    BlockEdit
  ) {
    return function (props) {
      const { attributes, setAttributes, isSelected } = props;
      const tailwindClasses = attributes.tailwindClasses || "";

      return createElement(
        Fragment,
        null,
        createElement(BlockEdit, props),
        isSelected &&
          createElement(
            InspectorControls,
            null,
            createElement(
              PanelBody,
              {
                title: "Tailwind Classes",
                initialOpen: true,
              },
              createElement(TextControl, {
                label: "Classes",
                value: tailwindClasses,
                onChange: function (value) {
                  setAttributes({ tailwindClasses: value });
                },
                help: "Enter Tailwind CSS classes (e.g., bg-blue-500 text-white p-4)",
              })
            )
          )
      );
    };
  },
  "withTailwindClasses");

  addFilter(
    "editor.BlockEdit",
    "tailwindwp/with-tailwind-classes",
    withTailwindClasses
  );

  // Apply tailwindClasses to block wrapper in editor
  addFilter(
    "editor.BlockListBlock",
    "tailwindwp/apply-classes",
    createHigherOrderComponent(function (BlockListBlock) {
      return function (props) {
        const { attributes } = props;
        const tailwindClasses = attributes.tailwindClasses || "";

        if (!tailwindClasses) {
          return createElement(BlockListBlock, props);
        }

        // Add tailwind classes to the wrapper
        const newProps = {
          ...props,
          className: [props.className, tailwindClasses]
            .filter(Boolean)
            .join(" "),
        };

        return createElement(BlockListBlock, newProps);
      };
    }, "withAppliedTailwindClasses")
  );

  // Also apply classes on save (frontend)
  addFilter(
    "blocks.getSaveContent.extraProps",
    "tailwindwp/save-classes",
    function (extraProps, blockType, attributes) {
      const tailwindClasses = attributes.tailwindClasses || "";

      if (tailwindClasses) {
        extraProps.className = [extraProps.className, tailwindClasses]
          .filter(Boolean)
          .join(" ");
      }

      return extraProps;
    }
  );

  // Wait for editor iframe to be ready, then fetch initial CSS
  function waitForIframeAndFetch() {
    const iframe = getEditorIframe();
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      const blocks = wp.data.select("core/block-editor").getBlocks();
      const classes = collectAllClasses(blocks);
      if (classes.length) {
        fetchTailwindCSS(classes);
      }
    } else {
      // Retry until iframe is ready
      setTimeout(waitForIframeAndFetch, 500);
    }
  }

  // Start waiting for iframe
  setTimeout(waitForIframeAndFetch, 500);
})();
