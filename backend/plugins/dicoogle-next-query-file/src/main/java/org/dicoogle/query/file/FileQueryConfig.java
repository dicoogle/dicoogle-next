package org.dicoogle.query.file;

import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FileQueryConfig {

  @Bean
  @ConditionalOnBean(FileReadWriteStoragePlugin.class)
  FileReadWriteDimseFindPlugin fileReadWriteDimseFindPlugin(
      FileReadWriteStoragePlugin storagePlugin) {
    return new FileReadWriteDimseFindPlugin(storagePlugin);
  }
}
