#include "GDEP133C02.h"
#include "comm.h"
#include "pindefine.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void app_main(void)
{
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, 1);
    epdHardwareReset();
    vTaskDelay(100 / portTICK_PERIOD_MS);
    
    setPinCsAll(1);
    initEPD();
    
    setPinCsAll(0);
    checkBusyLow();
    epdDisplayColor(RED);  // Try RED instead of white
    setPinCsAll(1);
    
    while(1) {
        vTaskDelay(10000 / portTICK_PERIOD_MS);
    }
}
