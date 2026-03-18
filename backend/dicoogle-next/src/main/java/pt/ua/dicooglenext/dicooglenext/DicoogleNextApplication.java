package pt.ua.dicooglenext.dicooglenext;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication(scanBasePackages = "pt.ua.dicooglenext")
@ConfigurationPropertiesScan
public class DicoogleNextApplication {

  public static void main(String[] args) {
    SpringApplication.run(DicoogleNextApplication.class, args);
  }
}
