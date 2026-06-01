package org.dicoogle.app.settings;

public interface SettingsStore {

  RuntimeSettings load();

  void save(RuntimeSettings settings);
}
