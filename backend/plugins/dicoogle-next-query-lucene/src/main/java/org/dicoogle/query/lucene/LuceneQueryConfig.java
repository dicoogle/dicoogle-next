package org.dicoogle.query.lucene;

import java.io.IOException;
import org.dicoogle.core.storage.StorageRouter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

@Configuration
@EnableConfigurationProperties(LuceneQueryProperties.class)
public class LuceneQueryConfig {

  @Bean(initMethod = "start", destroyMethod = "stop")
  @Order(0)
  @ConditionalOnProperty(prefix = "app.query.lucene", name = "enabled", havingValue = "true")
  LuceneQueryIndexPlugin luceneQueryIndexPlugin(
      StorageRouter storageRouter, LuceneQueryProperties properties) throws IOException {
    return new LuceneQueryIndexPlugin(storageRouter, properties);
  }
}
