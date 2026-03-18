package pt.ua.dicooglenext.storage.filerw;

import java.nio.file.Path;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FileReadWriteStorageProperties.class)
public class FileReadWriteStorageConfig {

  @Bean
  @ConditionalOnProperty(prefix = "app.storage.file-rw", name = "enabled", havingValue = "true")
  FileReadWriteStoragePlugin fileReadWriteStoragePlugin(FileReadWriteStorageProperties properties) {
    return new FileReadWriteStoragePlugin(Path.of(properties.getRootDir()), properties.getScheme());
  }
}
