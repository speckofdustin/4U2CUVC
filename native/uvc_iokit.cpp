#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>
#include <libkern/OSByteOrder.h>

#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

namespace {

constexpr uint8_t kVideoClass = 14;
constexpr uint8_t kVideoControlSubclass = 1;
constexpr uint8_t kSetCurrent = 0x01;
constexpr uint8_t kGetCurrent = 0x81;
constexpr uint8_t kClassInterfaceOut = 0x21;
constexpr uint8_t kClassInterfaceIn = 0xA1;
constexpr uint8_t kAutoExposureSelector = 2;
constexpr uint8_t kExposureSelector = 4;

bool parseNumber(const char* text, uint32_t& value) {
  if (!text || !*text) return false;
  errno = 0;
  char* end = nullptr;
  const unsigned long parsed = std::strtoul(text, &end, 0);
  if (errno || !end || *end || parsed > UINT32_MAX) return false;
  value = static_cast<uint32_t>(parsed);
  return true;
}

bool copyUIntProperty(io_service_t service, CFStringRef key, uint32_t& value) {
  CFTypeRef property = IORegistryEntrySearchCFProperty(
      service, kIOServicePlane, key, kCFAllocatorDefault,
      kIORegistryIterateRecursively | kIORegistryIterateParents);
  if (!property) return false;
  bool ok = false;
  if (CFGetTypeID(property) == CFNumberGetTypeID()) {
    int64_t number = 0;
    ok = CFNumberGetValue(static_cast<CFNumberRef>(property), kCFNumberSInt64Type, &number) &&
         number >= 0 && number <= UINT32_MAX;
    if (ok) value = static_cast<uint32_t>(number);
  }
  CFRelease(property);
  return ok;
}

std::string ioError(IOReturn result) {
  char buffer[32];
  std::snprintf(buffer, sizeof(buffer), "0x%08x", result);
  return buffer;
}

IOReturn transfer(IOUSBInterfaceInterface942** interface, uint8_t requestType,
                  uint8_t request, uint8_t selector, uint8_t unit,
                  uint8_t interfaceNumber, void* data, uint16_t length) {
  IOUSBDevRequest usbRequest{};
  usbRequest.bmRequestType = requestType;
  usbRequest.bRequest = request;
  usbRequest.wValue = static_cast<UInt16>(selector) << 8;
  usbRequest.wIndex = (static_cast<UInt16>(unit) << 8) | interfaceNumber;
  usbRequest.wLength = length;
  usbRequest.pData = data;
  return (*interface)->ControlRequest(interface, 0, &usbRequest);
}

int operate(io_service_t service, uint32_t vendor, uint32_t product,
            uint32_t exposure, uint8_t terminalUnit) {
  uint32_t foundVendor = 0, foundProduct = 0, interfaceClass = 0;
  uint32_t interfaceSubclass = 0, interfaceNumber = 0;
  if (!copyUIntProperty(service, CFSTR("idVendor"), foundVendor) ||
      !copyUIntProperty(service, CFSTR("idProduct"), foundProduct) ||
      !copyUIntProperty(service, CFSTR("bInterfaceClass"), interfaceClass) ||
      !copyUIntProperty(service, CFSTR("bInterfaceSubClass"), interfaceSubclass) ||
      !copyUIntProperty(service, CFSTR("bInterfaceNumber"), interfaceNumber)) {
    return 1;
  }
  if (foundVendor != vendor || foundProduct != product ||
      interfaceClass != kVideoClass || interfaceSubclass != kVideoControlSubclass) {
    return 1;
  }

  IOCFPlugInInterface** plugin = nullptr;
  SInt32 score = 0;
  IOReturn result = IOCreatePlugInInterfaceForService(
      service, kIOUSBInterfaceUserClientTypeID, kIOCFPlugInInterfaceID,
      &plugin, &score);
  if (result != kIOReturnSuccess || !plugin) {
    std::cerr << "Could not create USB interface plugin: " << ioError(result) << "\n";
    return 2;
  }

  IOUSBInterfaceInterface942** interface = nullptr;
  HRESULT query = (*plugin)->QueryInterface(
      plugin, CFUUIDGetUUIDBytes(kIOUSBInterfaceInterfaceID942),
      reinterpret_cast<LPVOID*>(&interface));
  (*plugin)->Release(plugin);
  if (query || !interface) {
    std::cerr << "Could not create USB interface: 0x" << std::hex << query << "\n";
    return 2;
  }

  // The system UVC service normally owns this interface. Logi Tune uses the
  // interface user client without seizing/detaching that driver, so retain the
  // user client and attempt pipe-zero class requests even when an exclusive
  // USBInterfaceOpen is unavailable.
  result = (*interface)->USBInterfaceOpen(interface);
  const bool openedExclusively = result == kIOReturnSuccess;

  uint8_t manualMode = 1;
  result = transfer(interface, kClassInterfaceOut, kSetCurrent,
                    kAutoExposureSelector, terminalUnit,
                    static_cast<uint8_t>(interfaceNumber), &manualMode, 1);
  if (result == kIOReturnSuccess) {
    uint32_t littleExposure = OSSwapHostToLittleInt32(exposure);
    result = transfer(interface, kClassInterfaceOut, kSetCurrent,
                      kExposureSelector, terminalUnit,
                      static_cast<uint8_t>(interfaceNumber), &littleExposure, 4);
  }

  uint32_t readback = 0;
  if (result == kIOReturnSuccess) {
    result = transfer(interface, kClassInterfaceIn, kGetCurrent,
                      kExposureSelector, terminalUnit,
                      static_cast<uint8_t>(interfaceNumber), &readback, 4);
    readback = OSSwapLittleToHostInt32(readback);
  }

  if (openedExclusively) (*interface)->USBInterfaceClose(interface);
  (*interface)->Release(interface);

  if (result != kIOReturnSuccess) {
    std::cerr << "UVC request failed: " << ioError(result) << "\n";
    return 2;
  }

  std::cout << "{\"ok\":true,\"value\":" << readback
            << ",\"interface\":" << interfaceNumber
            << ",\"unit\":" << static_cast<unsigned>(terminalUnit) << "}\n";
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 4 || argc > 5) {
    std::cerr << "Usage: uvc_iokit <vendor> <product> <exposure> [terminal-unit]\n";
    return 64;
  }

  uint32_t vendor = 0, product = 0, exposure = 0, terminalUnit = 1;
  if (!parseNumber(argv[1], vendor) || !parseNumber(argv[2], product) ||
      !parseNumber(argv[3], exposure) ||
      (argc == 5 && !parseNumber(argv[4], terminalUnit)) ||
      vendor > UINT16_MAX || product > UINT16_MAX || !exposure ||
      terminalUnit > UINT8_MAX) {
    std::cerr << "Invalid numeric argument\n";
    return 64;
  }

  CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostInterface");
  io_iterator_t iterator = IO_OBJECT_NULL;
  kern_return_t result = IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator);
  if (result != KERN_SUCCESS) {
    std::cerr << "Could not enumerate USB interfaces: " << ioError(result) << "\n";
    return 2;
  }

  int status = 1;
  io_service_t service = IO_OBJECT_NULL;
  while ((service = IOIteratorNext(iterator))) {
    status = operate(service, vendor, product, exposure,
                     static_cast<uint8_t>(terminalUnit));
    IOObjectRelease(service);
    if (status != 1) break;
  }
  IOObjectRelease(iterator);

  if (status == 1) {
    std::cerr << "Matching UVC VideoControl interface not found\n";
    return 3;
  }
  return status;
}
