import express from "express";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 9500;
const PLUGIN_SLUG = "tailwindwp";
const PLUGIN_MAIN_FILE = "tailwindwp.php";

function getAllFiles(dirPath, excludeDirs = [], arrayOfFiles = []) {
  const files = readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = join(dirPath, file);
    if (statSync(filePath).isDirectory()) {
      const defaultExcludes = ["node_modules", ".git"];
      const allExcludes = [...defaultExcludes, ...excludeDirs];

      if (!allExcludes.some((exclude) => file.includes(exclude))) {
        arrayOfFiles = getAllFiles(filePath, excludeDirs, arrayOfFiles);
      }
    } else if (file.endsWith(".php") || file.endsWith(".js") || file.endsWith(".css")) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

const app = express();

app.use(express.static(__dirname));

app.get("/api/plugin-files", (req, res) => {
  try {
    const files = getAllFiles(__dirname).map((filePath) => {
      const relativePath = relative(__dirname, filePath);
      return {
        path: `/wordpress/wp-content/plugins/${PLUGIN_SLUG}/${relativePath}`,
        content: readFileSync(filePath, "utf-8"),
      };
    });

    res.json(files);
  } catch (error) {
    console.error("Error reading plugin files:", error);
    res.status(500).json({ error: "Failed to read plugin files" });
  }
});

app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>TailwindWP - WordPress Playground</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { overflow: hidden; }
          iframe { border: none; width: 100vw; height: 100vh; background: white; }
          #loading {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            text-align: center; font-size: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .spinner {
            border: 3px solid #e0e0e0; border-top: 3px solid #0073aa; border-radius: 50%;
            width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div id="loading"><div class="spinner"></div><div>Loading WordPress Playground...</div></div>
        <iframe id="playground" style="display:none;"></iframe>

        <script type="module">
          import { startPlaygroundWeb } from 'https://playground.wordpress.net/client/index.js';

          const iframe = document.getElementById('playground');
          const loadingEl = document.getElementById('loading');

          async function init() {
            try {
              const client = await startPlaygroundWeb({
                iframe,
                remoteUrl: 'https://playground.wordpress.net/remote.html?v=' + Date.now(),
                blueprint: {
                  landingPage: '/wp-admin/post-new.php',
                  preferredVersions: { php: '8.2', wp: 'latest' },
                  login: true,
                },
              });

              loadingEl.innerHTML = '<div class="spinner"></div><div>Installing TailwindWP plugin...</div>';

              // Enable WP_DEBUG
              await client.run({ code: \`<?php
                $wpConfig = file_get_contents('/wordpress/wp-config.php');
                if (strpos($wpConfig, "define( 'WP_DEBUG', false )") !== false) {
                    $wpConfig = str_replace(
                        "define( 'WP_DEBUG', false )",
                        "define( 'WP_DEBUG', true );\\ndefine( 'WP_DEBUG_LOG', true );\\ndefine( 'WP_DEBUG_DISPLAY', true )",
                        $wpConfig
                    );
                    file_put_contents('/wordpress/wp-config.php', $wpConfig);
                }
              \` });

              // Create plugin directory
              await client.run({ code: \`<?php
                chdir('/wordpress/wp-content/plugins');
                if (!is_dir('${PLUGIN_SLUG}')) {
                    mkdir('${PLUGIN_SLUG}', 0755, true);
                }
              \` });

              // Write plugin files (including vendor from local)
              const pluginFiles = await fetch('/api/plugin-files').then(r => r.json());
              console.log('Uploading', pluginFiles.length, 'files...');

              for (const file of pluginFiles) {
                const dir = file.path.substring(0, file.path.lastIndexOf('/'));
                try { await client.mkdir(dir); } catch (e) {}
                await client.writeFile(file.path, file.content);
              }

              loadingEl.innerHTML = '<div class="spinner"></div><div>Activating plugin...</div>';

              // Activate the plugin
              await client.run({ code: \`<?php
                require_once '/wordpress/wp-load.php';
                activate_plugin('${PLUGIN_SLUG}/${PLUGIN_MAIN_FILE}');
              \` });

              loadingEl.style.display = 'none';
              iframe.style.display = 'block';
              await client.goTo('/wp-admin/post-new.php');

              window.playgroundClient = client;
              window.playgroundReady = true;

              console.log('TailwindWP Playground ready!');
            } catch (error) {
              console.error('Error:', error);
              loadingEl.innerHTML = '<div style="color:#f44747;">Error: ' + error.message + '</div>';
            }
          }

          init();
        </script>
      </body>
    </html>
  `);
});

const server = app.listen(PORT, () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🎨 TailwindWP - WordPress Playground");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  📍 Open: http://localhost:${PORT}`);
  console.log("  👤 User: admin");
  console.log("  🔑 Pass: password");
  console.log("");
  console.log("  ⌨️  Press Ctrl+C to stop");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
});

process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down...");
  server.close(() => {
    console.log("✅ Server stopped\n");
    process.exit(0);
  });
});
