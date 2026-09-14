#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>


const char* ssid = "vivo V70 Elite";
const char* password = "Xaviersorna1206";

#define DHT_PIN 5
#define DHT_TYPE DHT11

#define MQ135_PIN 34

#define COOLING_RELAY 26
#define FAN_RELAY 27

#define LCD_SDA 21
#define LCD_SCL 22

#define RELAY_ON LOW
#define RELAY_OFF HIGH
 
DHT dht(
    DHT_PIN,
    DHT_TYPE
);

LiquidCrystal_I2C lcd(
    0x27,
    16,
    2
);

WebServer server(80);

float temperature = 0.0;
float humidity = 0.0;
int mq135 = 0;

float setpoint = 15.0;
float hysteresis = 1.0;

bool cooling = false;
bool fan = false;
bool autoMode = true;

String aiStatus = "WAITING";
float aiConfidence = 0.0;

unsigned long lastSensorRead = 0;
unsigned long lastLCDUpdate = 0;

unsigned long tomatoesChecked = 0;
unsigned long tomatoesRejected = 0;

int lcdPage = 0;


void setCooling(
    bool state
)
{
    cooling = state;

    digitalWrite(
        COOLING_RELAY,
        state ? RELAY_ON : RELAY_OFF
    );
}


void setFan(
    bool state
)
{
    fan = state;

    digitalWrite(
        FAN_RELAY,
        state ? RELAY_ON : RELAY_OFF
    );
}


void readSensors()
{
    float t =
        dht.readTemperature();

    float h =
        dht.readHumidity();


    if (!isnan(t))
    {
        temperature = t;
    }


    if (!isnan(h))
    {
        humidity = h;
    }


    mq135 =
        analogRead(
            MQ135_PIN
        );
}


void automaticCooling()
{
    if (!autoMode)
    {
        return;
    }


    if (
        temperature >
        setpoint
    )
    {
        setCooling(true);
        setFan(true);
    }


    if (
        temperature <=
        setpoint - hysteresis
    )
    {
        setCooling(false);
        setFan(false);
    }
}


void updateLCD()
{
    lcd.clear();


    if (lcdPage == 0)
    {
        lcd.setCursor(
            0,
            0
        );

        lcd.print("T:");

        lcd.print(
            temperature,
            1
        );

        lcd.print("C H:");

        lcd.print(
            humidity,
            0
        );

        lcd.print("%");


        lcd.setCursor(
            0,
            1
        );

        lcd.print("C:");

        lcd.print(
            cooling
                ? "ON "
                : "OFF"
        );

        lcd.print(" F:");

        lcd.print(
            fan
                ? "ON"
                : "OFF"
        );
    }


    else
    {
        lcd.setCursor(
            0,
            0
        );

        lcd.print("MQ:");

        lcd.print(
            mq135
        );


        lcd.setCursor(
            0,
            1
        );

        lcd.print("AI:");

        lcd.print(
            aiStatus
        );
    }


    lcdPage++;


    if (
        lcdPage > 1
    )
    {
        lcdPage = 0;
    }
}


void handleRoot()
{
    String html;

    html += "<html>";
    html += "<head>";
    html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
    html += "<title>AgroVault ESP32</title>";
    html += "</head>";
    html += "<body>";

    html += "<h1>AgroVault Controller</h1>";

    html += "<p>Temperature: ";
    html += String(
        temperature,
        1
    );
    html += " C</p>";

    html += "<p>Humidity: ";
    html += String(
        humidity,
        1
    );
    html += " %</p>";

    html += "<p>MQ-135: ";
    html += String(
        mq135
    );
    html += "</p>";

    html += "<p>Cooling: ";
    html += cooling
        ? "ON"
        : "OFF";
    html += "</p>";

    html += "<p>Fan: ";
    html += fan
        ? "ON"
        : "OFF";
    html += "</p>";

    html += "<p>Mode: ";
    html += autoMode
        ? "AUTO"
        : "MANUAL";
    html += "</p>";

    html += "</body>";
    html += "</html>";

    server.send(
        200,
        "text/html",
        html
    );
}


void handleData()
{
    String json = "{";

    json += "\"temperature\":";
    json += String(
        temperature,
        1
    );

    json += ",";

    json += "\"humidity\":";
    json += String(
        humidity,
        1
    );

    json += ",";

    json += "\"mq135\":";
    json += String(
        mq135
    );

    json += ",";

    json += "\"setpoint\":";
    json += String(
        setpoint,
        1
    );

    json += ",";

    json += "\"cooling\":";
    json += cooling
        ? "true"
        : "false";

    json += ",";

    json += "\"fan\":";
    json += fan
        ? "true"
        : "false";

    json += ",";

    json += "\"autoMode\":";
    json += autoMode
        ? "true"
        : "false";

    json += ",";

    json += "\"aiStatus\":\"";
    json += aiStatus;
    json += "\"";

    json += ",";

    json += "\"aiConfidence\":";
    json += String(
        aiConfidence,
        2
    );

    json += ",";

    json += "\"tomatoesChecked\":";
    json += String(
        tomatoesChecked
    );

    json += ",";

    json += "\"tomatoesRejected\":";
    json += String(
        tomatoesRejected
    );

    json += "}";

    server.send(
        200,
        "application/json",
        json
    );
}


void handleControl()
{
    if (!server.hasArg("cmd"))
    {
        server.send(
            400,
            "text/plain",
            "Missing command"
        );

        return;
    }


    String command =
        server.arg("cmd");


    if (
        command ==
        "on"
    )
    {
        autoMode = false;

        setCooling(true);
        setFan(true);
    }


    else if (
        command ==
        "off"
    )
    {
        autoMode = false;

        setCooling(false);
        setFan(false);
    }


    else if (
        command ==
        "auto"
    )
    {
        autoMode = true;

        automaticCooling();
    }


    else
    {
        server.send(
            400,
            "text/plain",
            "Invalid command"
        );

        return;
    }


    server.send(
        200,
        "text/plain",
        "OK"
    );
}


void handleSetpoint()
{
    if (
        !server.hasArg(
            "value"
        )
    )
    {
        server.send(
            400,
            "text/plain",
            "Missing value"
        );

        return;
    }


    float value =
        server
            .arg("value")
            .toFloat();


    if (
        value < 0 ||
        value > 30
    )
    {
        server.send(
            400,
            "text/plain",
            "Invalid value"
        );

        return;
    }


    setpoint = value;

    automaticCooling();


    server.send(
        200,
        "text/plain",
        "OK"
    );
}


void handleAI()
{
    if (
        !server.hasArg(
            "status"
        )
    )
    {
        server.send(
            400,
            "text/plain",
            "Missing status"
        );

        return;
    }


    String newStatus =
        server.arg(
            "status"
        );


    aiStatus =
        newStatus;


    if (
        server.hasArg(
            "confidence"
        )
    )
    {
        aiConfidence =
            server
                .arg(
                    "confidence"
                )
                .toFloat();
    }


    tomatoesChecked++;


    if (
        aiStatus ==
        "REJECT"
    )
    {
        tomatoesRejected++;
    }


    server.send(
        200,
        "text/plain",
        "AI result received"
    );
}


void connectWiFi()
{
    WiFi.begin(
        ssid,
        password
    );


    Serial.print(
        "Connecting"
    );


    while (
        WiFi.status() !=
        WL_CONNECTED
    )
    {
        delay(500);

        Serial.print(".");
    }


    Serial.println();

    Serial.println(
        "WiFi connected"
    );


    Serial.print(
        "ESP32 IP: "
    );


    Serial.println(
        WiFi.localIP()
    );
}


void setup()
{
    Serial.begin(
        115200
    );


    pinMode(
        COOLING_RELAY,
        OUTPUT
    );


    pinMode(
        FAN_RELAY,
        OUTPUT
    );


    digitalWrite(
        COOLING_RELAY,
        RELAY_OFF
    );


    digitalWrite(
        FAN_RELAY,
        RELAY_OFF
    );


    analogReadResolution(
        12
    );


    dht.begin();


    Wire.begin(
        LCD_SDA,
        LCD_SCL
    );


    lcd.init();

    lcd.backlight();

    lcd.clear();


    lcd.setCursor(
        0,
        0
    );

    lcd.print(
        "AgroVault"
    );


    lcd.setCursor(
        0,
        1
    );

    lcd.print(
        "Starting..."
    );


    delay(1500);


    connectWiFi();


    lcd.clear();


    lcd.setCursor(
        0,
        0
    );

    lcd.print(
        "WiFi Connected"
    );


    delay(1000);


    server.on(
        "/",
        handleRoot
    );


    server.on(
        "/api/data",
        handleData
    );


    server.on(
        "/control",
        handleControl
    );


    server.on(
        "/setpoint",
        handleSetpoint
    );


    server.on(
        "/ai",
        handleAI
    );


    server.begin();

    server.enableCORS(true);


    Serial.println(
        "AgroVault server started"
    );


    readSensors();

    automaticCooling();

    updateLCD();
}


void loop()
{
    server.handleClient();


    if (
        millis() -
        lastSensorRead >=
        2000
    )
    {
        lastSensorRead =
            millis();

        readSensors();

        automaticCooling();
    }


    if (
        millis() -
        lastLCDUpdate >=
        3000
    )
    {
        lastLCDUpdate =
            millis();

        updateLCD();
    }
}