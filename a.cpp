#include <iostream>
using namespace std;

template<typename T>
class BinarySearch {
private:
    T *arr;
    int size;

public:
    BinarySearch() : arr(nullptr), size(0) {}

    ~BinarySearch() {
        delete[] arr;
    }

    T inputArray() {
        cout << "How many elements do you want to enter: ";
        cin >> size;

        arr = new T[size];

        for (int i = 0; i < size; i++) {
            cout << "Enter element for position " << i << ": ";
            cin >> arr[i];
        }

        T target;
        cout << "\nEnter the target element: ";
        cin >> target;

        return target;
    }

    void sortArray() {
        for (int i = 0; i < size - 1; i++) {
            for (int j = 0; j < size - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    T temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }

    int binarySearch(T target) {
        int low = 0;
        int high = size - 1;

        while (low <= high) {
            int mid = low + ((high - low) / 2);
            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] > target) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        return -1;
    }
};

int main() {
    BinarySearch<int> bs;
    int target = bs.inputArray();
    bs.sortArray();
    int index = bs.binarySearch(target);

    if (index != -1) {
        cout << "\nElement " << target << " is found at index " << index << ".";
    } else {
        cout << "\nElement " << target << " is not found.";
    }

    return 0;
}