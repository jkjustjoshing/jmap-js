.PHONY: all build clean

all: build

clean:
	rm -rf build

build:
	node build.js source $@
