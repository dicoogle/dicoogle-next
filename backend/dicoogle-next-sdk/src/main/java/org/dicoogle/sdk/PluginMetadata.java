package org.dicoogle.sdk;

/**
 * Immutable descriptor for a Dicoogle plugin.
 *
 * @param id      a short, unique, machine-readable identifier for the plugin (e.g.
 *                {@code "query-file-rw"}). Must be unique within a running Dicoogle instance.
 * @param name    a human-readable display name (e.g. {@code "Filesystem DICOM Query/Index"}).
 * @param version the plugin's own version string (e.g. {@code "0.1.0"}), independent of the
 *                Dicoogle version.
 * @param type    the plugin type token recognised by the framework (e.g. {@code "query-index"},
 *                {@code "storage"}).  The framework uses this value to route the plugin to the
 *                correct registry.
 */
public record PluginMetadata(String id, String name, String version, String type) {}
