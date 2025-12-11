# Build Stage
FROM maven:3.9.9-eclipse-temurin-17-alpine AS build
WORKDIR /app
COPY . .
RUN mvn clean install -DskipTests
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/dicoogle/target/dicoogle.jar", "-s"]

