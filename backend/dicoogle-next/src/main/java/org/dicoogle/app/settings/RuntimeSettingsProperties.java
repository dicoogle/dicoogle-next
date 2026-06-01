package org.dicoogle.app.settings;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.runtime-settings")
public class RuntimeSettingsProperties {

  private String store = "yaml";
  private String path = "./data/runtime-settings.yml";

  public String getStore() {
    return store;
  }

  public void setStore(String store) {
    this.store = store;
  }

  public String getPath() {
    return path;
  }

  public void setPath(String path) {
    this.path = path;
  }
}
