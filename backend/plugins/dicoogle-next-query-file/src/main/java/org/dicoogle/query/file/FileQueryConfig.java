package org.dicoogle.query.file;

import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FileQueryConfig {

  @Bean
  @ConditionalOnBean(ReadableStoragePlugin.class)
  @ConditionalOnProperty(
      prefix = "app.query.file",
      name = "enabled",
      havingValue = "true",
      matchIfMissing = true)
  FileQueryIndexPlugin fileQueryIndexPlugin(ReadableStoragePlugin storagePlugin) {
    return new FileQueryIndexPlugin(storagePlugin);
  }
}
