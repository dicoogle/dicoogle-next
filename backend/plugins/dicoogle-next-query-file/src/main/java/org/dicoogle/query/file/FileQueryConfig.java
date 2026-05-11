package org.dicoogle.query.file;

import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

@Configuration
public class FileQueryConfig {

  @Bean
  @ConditionalOnBean(ReadableStoragePlugin.class)
  FileQueryIndexPlugin fileQueryIndexPlugin(ReadableStoragePlugin storagePlugin) {
    return new FileQueryIndexPlugin(storagePlugin);
  }
}
