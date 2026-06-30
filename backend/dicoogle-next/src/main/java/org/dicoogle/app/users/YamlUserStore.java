package org.dicoogle.app.users;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class YamlUserStore implements UserStore {

  private static final Logger log = LoggerFactory.getLogger(YamlUserStore.class);
  private static final ObjectMapper MAPPER = new ObjectMapper(new YAMLFactory());

  private final Path path;

  public YamlUserStore(UserStoreProperties properties) {
    String configured = properties.getPath();
    this.path =
        configured == null || configured.isBlank()
            ? Paths.get("./data/users.yml")
            : Paths.get(configured);
  }

  @Override
  public List<UserSettings> load() {
    if (!Files.exists(path)) {
      return List.of();
    }
    try {
      UsersWrapper wrapper = MAPPER.readValue(path.toFile(), UsersWrapper.class);
      return wrapper.getUsers();
    } catch (IOException ex) {
      log.warn("Failed to read users from {}", path, ex);
      return List.of();
    }
  }

  @Override
  public void save(List<UserSettings> users) {
    try {
      Files.createDirectories(path.getParent());
      UsersWrapper wrapper = new UsersWrapper();
      wrapper.setUsers(users);
      MAPPER.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), wrapper);
    } catch (IOException ex) {
      throw new IllegalStateException("Failed to write users to " + path, ex);
    }
  }
}
