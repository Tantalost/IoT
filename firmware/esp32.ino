#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <HardwareSerial.h>

// Enter your Wi-Fi credentials
const char* ssid = "TANTALOS 2489";
const char* password = "]r06019G";

const char* serverName = "http://192.168.137.1:3000/api/energy"; 

// PZEM 1 Pins (Using Hardware Serial 2)
#define PZEM1_RX_PIN 26
#define PZEM1_TX_PIN 25
PZEM004Tv30 pzem1(Serial2, PZEM1_RX_PIN, PZEM1_TX_PIN);

// PZEM 2 Pins (Using Hardware Serial 1)
#define PZEM2_RX_PIN 16
#define PZEM2_TX_PIN 17
PZEM004Tv30 pzem2(Serial1, PZEM2_RX_PIN, PZEM2_TX_PIN);

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
  if ((millis() - lastTime) > timerDelay) {
    if (WiFi.status() == WL_CONNECTED) {
      
      // Read Sensor 1
      float v1 = pzem1.voltage();
      float c1 = pzem1.current();
      float p1 = pzem1.power();
      float e1 = pzem1.energy();
      if (!isnan(p1) && p1 < 3.0) {
        p1 = 0.0;
        c1 = 0.0;
      }
      float v2 = pzem2.voltage();
      float c2 = pzem2.current();
      float p2 = pzem2.power();
      float e2 = pzem2.energy();
      if (!isnan(p2) && p2 < 3.0) {
        p2 = 0.0;
        c2 = 0.0;
      }

      HTTPClient http;
      http.begin(serverName);
      http.addHeader("Content-Type", "application/json");

      StaticJsonDocument<512> doc;      
      JsonArray nodes = doc.createNestedArray("nodes");

      JsonObject node1 = nodes.createNestedObject();
      node1["id"] = 1;
      // If sensor is unplugged from AC, isnan() prevents it from sending "null" strings
      node1["voltage"] = isnan(v1) ? 0 : v1;
      node1["current"] = isnan(c1) ? 0 : c1;
      node1["power"] = isnan(p1) ? 0 : p1;
      node1["energy"] = isnan(e1) ? 0 : e1;

      // --- Append Node 2 Data ---
      JsonObject node2 = nodes.createNestedObject();
      node2["id"] = 2;
      node2["voltage"] = isnan(v2) ? 0 : v2;
      node2["current"] = isnan(c2) ? 0 : c2;
      node2["power"] = isnan(p2) ? 0 : p2;
      node2["energy"] = isnan(e2) ? 0 : e2;

      String jsonPayload;
      serializeJson(doc, jsonPayload);

      // Send the POST request
      int httpResponseCode = http.POST(jsonPayload);
      if (httpResponseCode > 0) {
        Serial.print("✅ HTTP Response code: ");
        Serial.println(httpResponseCode);
        Serial.println("Payload: " + jsonPayload);
      } else {
        Serial.print("❌ HTTP Request failed. Error code: ");
        Serial.println(httpResponseCode);
        Serial.println("Error details: " + http.errorToString(httpResponseCode)); 
      }

      http.end();
      
    } else {
      Serial.println("Wi-Fi Disconnected");
    }
    lastTime = millis();
  }
}