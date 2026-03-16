package pt.ua.dicooglenext.dicooglenext;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DicoogleNextApplication {

  public static void main(String[] args) {
    SpringApplication.run(DicoogleNextApplication.class, args);
  }
}
