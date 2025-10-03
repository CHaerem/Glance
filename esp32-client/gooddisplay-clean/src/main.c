#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "GDEP133C02.h"
#include "comm.h"
#include "pindefine.h"

void app_main(void)
{
    esp_task_wdt_delete(xTaskGetIdleTaskHandleForCore(0));
    
    printf("\n=== GLANCE: Solid color test ===\n");
    
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    vTaskDelay(pdMS_TO_TICKS(500));
    setPinCsAll(GPIO_HIGH);
    initEPD();
    
    printf("Displaying YELLOW...\n");
    epdDisplayColor(YELLOW);
    
    printf("=== YELLOW SCREEN DISPLAYED ===\n");
    
    while(1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
        printf("Running...\n");
    }
}
