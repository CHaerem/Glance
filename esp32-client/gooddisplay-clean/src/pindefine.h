

#ifndef __PINDEFINE_H__
#define __PINDEFINE_H__

//==============  Standard SPI Setting   ==============//
//Please modify the pin number
#define SPI_CS0		18
#define SPI_CS1		17
#define SPI_CLK		9
#define SPI_Data0	41
#define SPI_Data1	40
#define SPI_Data2	39
#define SPI_Data3	38

//==============   GPIO Setting   ==============//
//Please modify the pin number
#define EPD_BUSY	7   // Please set it as input pin
#define EPD_RST		6   // Please set it as output pin
#define LOAD_SW		45  // Please set it as output pin

//==============   Battery Monitoring   ==============//
// Battery voltage via voltage divider (calibrated ratio: 4.7)
// Connected to unlabeled solder pad on Good Display ESP32-133C02
// Pad identified by "2 sec HIGH" timing in GPIO discovery mode
#define BATTERY_PIN	2   // GPIO 2 = ADC1_CH1

//===============================================

#define GPIO_LOW	0
#define GPIO_HIGH	1

#endif //#ifndef __PINDEFINE_H__
