layer_build:
	docker run --rm \
		-v ${CURDIR}/layers/lambda_layer:/var/task \
		lambci/lambda:build-python3.8 \
		pip install -r requirements.txt -t python/
