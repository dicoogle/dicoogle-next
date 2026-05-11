package org.dicoogle.query.file;

import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

@Configuration
public class FileQueryConfig {

  @Bean
  @Order(100)
  @ConditionalOnBean(FileReadWriteStoragePlugin.class)
  FileReadWriteDimseFindPlugin fileReadWriteDimseFindPlugin(
      FileReadWriteStoragePlugin storagePlugin) {
    return new FileReadWriteDimseFindPlugin(storagePlugin);
  }
}
