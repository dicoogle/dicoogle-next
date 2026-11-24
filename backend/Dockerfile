FROM eclipse-temurin:21-jre
WORKDIR /app
COPY dicoogle-next/target/dicoogle-next-*-exec.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
