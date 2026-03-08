plugins {
    java
    `java-library`
    `maven-publish`
}

group = "dev.uncaught"
version = "0.1.0"

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

repositories {
    mavenCentral()
}

dependencies {
    compileOnly("org.springframework.boot:spring-boot-autoconfigure:3.2.0")
    compileOnly("jakarta.servlet:jakarta.servlet-api:6.0.0")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}

tasks.test {
    useJUnitPlatform()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            pom {
                name.set("Uncaught Java SDK")
                description.set("Java SDK for the Uncaught error monitoring system")
                url.set("https://github.com/uncaughtdev/uncaught")
                licenses {
                    license {
                        name.set("MIT")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }
            }
        }
    }
}
