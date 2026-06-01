package org.dicoogle.app.users;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.users")
public class UserStoreProperties {

  private String path = "./data/users.yml";

  public String getPath() {
    return path;
  }

  public void setPath(String path) {
    this.path = path;
  }
}
