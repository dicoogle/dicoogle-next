package org.dicoogle.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "org.dicoogle")
@ConfigurationPropertiesScan
@EnableScheduling
public class DicoogleNextApplication {

  public static void main(String[] args) {
    SpringApplication.run(DicoogleNextApplication.class, args);
  }
}
