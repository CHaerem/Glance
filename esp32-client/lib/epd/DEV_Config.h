/*****************************************************************************
* | File      	:   DEV_Config.h
* | Author      :   Waveshare team
* | Function    :   Hardware underlying interface
* | Info        :
*----------------
* |	This version:   V1.0
* | Date        :   2020-02-19
* | Info        :
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to  whom the Software is
# furished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS OR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
******************************************************************************/
#ifndef _DEV_CONFIG_H_
#define _DEV_CONFIG_H_

#include <Arduino.h>
#include <stdint.h>
#include <stdio.h>



/**
 * data
**/
#define UBYTE   uint8_t
#define UWORD   uint16_t
#define UDOUBLE uint32_t

/**
 * GPIO config - Board-specific pin assignments
**/
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
// Good Display ESP32-133C02 with ESP32-S3 and QSPI interface
#define EPD_SCK_PIN     9     // QSPI Clock
#define EPD_MOSI_PIN    41    // QSPI Data0 (MOSI)
#define EPD_CS_M_PIN    18    // Chip Select 0
#define EPD_CS_S_PIN    17    // Chip Select 1
#define EPD_RST_PIN     6     // Reset
#define EPD_DC_PIN      40    // QSPI Data1 (used as DC in some modes)
#define EPD_BUSY_PIN    7     // Busy Signal
#define EPD_PWR_PIN     45    // Power Control (LOAD_SW)
// Additional QSPI data pins for quad mode
#define EPD_DATA2_PIN   39    // QSPI Data2
#define EPD_DATA3_PIN   38    // QSPI Data3
#else
// ESP32 Feather v2 to 13.3" E6 HAT+ Display (Standard SPI)
#define EPD_SCK_PIN     5     // SPI Clock (CLK)
#define EPD_MOSI_PIN    19    // SPI MOSI (DIN)
#define EPD_CS_M_PIN    32    // Chip Select Master
#define EPD_CS_S_PIN    12    // Chip Select Slave
#define EPD_RST_PIN     33    // Reset
#define EPD_DC_PIN      15    // Data/Command
#define EPD_BUSY_PIN    27    // Busy Signal
#define EPD_PWR_PIN     14    // Power Control
#endif



#define GPIO_PIN_SET   1
#define GPIO_PIN_RESET 0

/**
 * GPIO read and write
**/
#define DEV_Digital_Write(_pin, _value) digitalWrite(_pin, _value == 0? LOW:HIGH)
#define DEV_Digital_Read(_pin) digitalRead(_pin)

/**
 * delay x ms
**/
#define DEV_Delay_ms(__xms) delay(__xms)

/*------------------------------------------------------------------------------------------------------*/
UBYTE DEV_Module_Init(void);
void GPIO_Mode(UWORD GPIO_Pin, UWORD Mode);
void DEV_SPI_WriteByte(UBYTE data);
UBYTE DEV_SPI_ReadByte();
void DEV_SPI_Write_nByte(UBYTE *pData, UDOUBLE len);
void DEV_Module_Exit(void);

#endif
