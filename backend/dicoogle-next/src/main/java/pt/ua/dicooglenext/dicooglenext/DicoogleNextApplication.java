package pt.ua.dicooglenext.dicooglenext;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "pt.ua.dicooglenext")
@ConfigurationPropertiesScan
@EnableScheduling
public class DicoogleNextApplication {

  public static void main(String[] args) {
    SpringApplication.run(DicoogleNextApplication.class, args);
  }
}
