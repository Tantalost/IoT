#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <HardwareSerial.h>

// Enter your Wi-Fi credentials
const char* ssid = "TANTALOS 2489";
const char* password = "]r06019G";

const char* serverName = "http://192.168.254.113:3000/api/energy"; 

// PZEM Pins
#define PZEM_RX_PIN 26
#define PZEM_TX_PIN 25

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);

// Timer variables to avoid using delay()
unsigned long lastTime = 0;
unsigned long timerDelay = 2000; // Send data every 2 seconds

void setup() {
  Serial.begin(115200);

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.println("Connecting to Wi-Fi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected to Wi-Fi network with IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Check if it's time to send data and if Wi-Fi is connected
  if ((millis() - lastTime) > timerDelay) {
    if (WiFi.status() == WL_CONNECTED) {
      
      float voltage = pzem.voltage();
      float current = pzem.current();
      float power = pzem.power();
      float energy = pzem.energy();

      if (isnan(voltage)) {
        Serial.println("Error reading voltage. Check AC power.");
      } else {
        HTTPClient http;
        http.begin(serverName);
        http.addHeader("Content-Type", "application/json");

        // Create the JSON payload
        StaticJsonDocument<200> doc;
        doc["voltage"] = voltage;
        doc["current"] = current;
        doc["power"] = power;
        doc["energy"] = energy;

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        // Send the POST request
        int httpResponseCode = http.POST(jsonPayload);

        Serial.print("HTTP Response code: ");
        Serial.println(httpResponseCode);
        Serial.println("Payload: " + jsonPayload);

        http.end(); // Free resources
      }
    } else {
      Serial.println("Wi-Fi Disconnected");
    }
    lastTime = millis();
  }
}