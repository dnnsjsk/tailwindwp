<?php
/**
 * Plugin Name: TailwindWP
 * Description: Use TailwindCSS classes directly in the WordPress block editor
 * Version: 1.0.0
 * Author: Dennis Josek
 * License: MIT
 * Requires PHP: 8.2
 */

if (!defined('ABSPATH')) {
    exit;
}

define('TAILWINDWP_VERSION', '1.0.0');
define('TAILWINDWP_PATH', plugin_dir_path(__FILE__));
define('TAILWINDWP_URL', plugin_dir_url(__FILE__));

// Load TailwindPHP via Composer autoload
$autoload = TAILWINDWP_PATH . 'vendor/autoload.php';
if (file_exists($autoload)) {
    require_once $autoload;
}

use TailwindPHP\tw;

/**
 * Generate CSS from Tailwind classes
 *
 * @param array $classes Array of Tailwind class names
 * @param array $options {
 *     @type string $scope      CSS selector to scope preflight (e.g., '.editor-styles-wrapper')
 *     @type bool   $staticTheme Include all CSS variables (no tree-shaking)
 *     @type bool   $minify     Minify output
 * }
 */
function tailwindwp_generate_css(array $classes, array $options = []): string {
    if (empty($classes)) {
        return '';
    }

    $content = implode(' ', array_unique($classes));
    $scope = $options['scope'] ?? '';
    $staticTheme = $options['staticTheme'] ?? false;

    // theme(static) includes all CSS variables without tree-shaking
    $themeModifier = $staticTheme ? ' theme(static)' : '';

    // Build CSS input with optional scoped preflight
    if ($scope) {
        // Scope preflight to a specific selector (e.g., .editor-styles-wrapper)
        // This prevents Tailwind's reset from affecting the rest of the page
        $css_input = "
            @layer theme, base, components, utilities;
            @import \"tailwindcss/theme.css\" layer(theme){$themeModifier};
            {$scope} {
                @import \"tailwindcss/preflight.css\" layer(base);
            }
            @import \"tailwindcss/utilities.css\" layer(utilities);
        ";
    } else {
        // No scoping - include full Tailwind (frontend)
        if ($staticTheme) {
            $css_input = "
                @layer theme, base, components, utilities;
                @import \"tailwindcss/theme.css\" layer(theme) theme(static);
                @import \"tailwindcss/preflight.css\" layer(base);
                @import \"tailwindcss/utilities.css\" layer(utilities);
            ";
        } else {
            $css_input = '@import "tailwindcss";';
        }
    }

    return tw::generate([
        'content' => '<div class="' . $content . '">',
        'css' => $css_input,
        'minify' => $options['minify'] ?? false,
    ]);
}

/**
 * Register REST API endpoint
 */
add_action('rest_api_init', function () {
    register_rest_route('tailwindwp/v1', '/css', [
        'methods' => 'POST',
        'callback' => 'tailwindwp_rest_generate_css',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ]);
});

function tailwindwp_rest_generate_css(WP_REST_Request $request): WP_REST_Response {
    $classes = $request->get_param('classes') ?? [];
    $scope = $request->get_param('scope') ?? '';
    $minify = $request->get_param('minify') ?? false;

    if (!is_array($classes)) {
        $classes = explode(' ', $classes);
    }

    $classes = array_filter(array_map('trim', $classes));

    try {
        $css = tailwindwp_generate_css($classes, [
            'scope' => $scope,
            'minify' => $minify,
        ]);

        return new WP_REST_Response([
            'success' => true,
            'css' => $css,
        ]);
    } catch (Exception $e) {
        return new WP_REST_Response([
            'success' => false,
            'error' => $e->getMessage(),
        ], 500);
    }
}

/**
 * Enqueue editor scripts
 */
add_action('enqueue_block_editor_assets', function () {
    wp_enqueue_script(
        'tailwindwp-editor',
        TAILWINDWP_URL . 'src/editor.js',
        ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-compose', 'wp-hooks', 'wp-data'],
        TAILWINDWP_VERSION,
        true
    );

    wp_localize_script('tailwindwp-editor', 'tailwindwpConfig', [
        'apiUrl' => rest_url('tailwindwp/v1/css'),
        'nonce' => wp_create_nonce('wp_rest'),
    ]);
});

/**
 * Add Tailwind CSS to editor
 */
add_action('enqueue_block_editor_assets', function () {
    // Add empty style tag that will be populated by JS
    wp_register_style('tailwindwp-dynamic', false);
    wp_enqueue_style('tailwindwp-dynamic');
    wp_add_inline_style('tailwindwp-dynamic', '/* TailwindWP dynamic styles */');
}, 20);

/**
 * Generate and inline CSS for frontend
 */
add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }

    $post = get_post();
    if (!$post) {
        return;
    }

    // Extract classes from blocks
    $blocks = parse_blocks($post->post_content);
    $classes = tailwindwp_extract_classes_from_blocks($blocks);

    if (empty($classes)) {
        return;
    }

    $css = tailwindwp_generate_css($classes, [
        'staticTheme' => true,  // Include all CSS variables on frontend
        'minify' => true,
    ]);

    if ($css) {
        echo '<style id="tailwindwp-styles">' . $css . '</style>';
    }
}, 5);

/**
 * Extract Tailwind classes from blocks recursively
 */
function tailwindwp_extract_classes_from_blocks(array $blocks): array {
    $classes = [];

    foreach ($blocks as $block) {
        // Get classes from tailwindClasses attribute
        if (!empty($block['attrs']['tailwindClasses'])) {
            $block_classes = $block['attrs']['tailwindClasses'];
            if (is_string($block_classes)) {
                $block_classes = explode(' ', $block_classes);
            }
            $classes = array_merge($classes, $block_classes);
        }

        // Also check className attribute for any Tailwind classes
        if (!empty($block['attrs']['className'])) {
            $class_names = explode(' ', $block['attrs']['className']);
            $classes = array_merge($classes, $class_names);
        }

        // Recurse into inner blocks
        if (!empty($block['innerBlocks'])) {
            $inner_classes = tailwindwp_extract_classes_from_blocks($block['innerBlocks']);
            $classes = array_merge($classes, $inner_classes);
        }
    }

    return array_unique(array_filter($classes));
}

/**
 * Register block attributes
 */
add_filter('register_block_type_args', function ($args, $block_type) {
    // Add tailwindClasses attribute to all blocks
    if (!isset($args['attributes'])) {
        $args['attributes'] = [];
    }

    $args['attributes']['tailwindClasses'] = [
        'type' => 'string',
        'default' => '',
    ];

    return $args;
}, 10, 2);
