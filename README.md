# Automatic Knative Service Manipulation

## Introduction

>**@Brief**: A VS Code extension that helps developers automatically manipulate Knative services on the Kubernetes cluster efficiently (e.g., deploying Knative services, retrieving details about Knative Services, deleting Knative services). 
>
>**@Author**: Dongzhi Zhang
>
>**@LastUpdate**: 2024/03/11

## Prerequisites

Please ensure the following tools are set up in your local environment.

- Docker / Docker Desktop

- Kubernetes (Minikube, kubectl)

- Knative

## Supported Commands

It currently supports the following commands:
 
 - **aksm.deployKnService**: Deploy a Knative service to the Kubernetes cluster (specified by the input "registry name" and "image name").

 - **aksm.describeKnService**: Print detailed information about a Knative service (specified by the input "service name").
 
- **aksm.listKnServices**: Describe All Knative Services: Print detailed information about all Knative services.

 - **aksm.deleteKnService**: Delete a Knative Service (specified by the input "service name").
 
 - **aksm.testExtension**: Test whether the extension is working properly.

## Example Usage

0. Ensure that necessary tools and dependencies are installed and started.

    - Refer to "prerequisites" for required tools. 

    - Make sure `minikube tunnel --profile knative` is executed to start the Minikube tunnel for Knative. 

1. Search for the extension "Automatic Knative Service Manipulation" in the VS Code marketplace and install it.

2. Open the folder containing the Flask app ready to run as the root folder.

    - The Python file should be named `app.py`, or the deployment would fail.

    - You need to provide a `requirements.txt` containing all dependencies that your Flask app needs.
    
    - Here I provide a quickstart under the folder "quickstart", which contains a Flask app `app.py` running a text classification ML task and a `requirements.txt` containing dependencies `flask, torch, transformers`. You can conduct a brief test on the extension under this folder.

3. In the VS Code palette, execute `aksm.testExtension` to test whether the extension is working properly.

    - Use `Ctrl+Shift+P` or `Cmd+Shift+P` for Mac to trigger the VS Code palette, which is totally different from simply clicking the search bar above.

4. To run the Flask app within a Knative service and deploy it to the Kubernetes cluster, execute `aksm.deployKnService` in the VS Code palette. 

    - You will need to specify the name of the Docker image registry ("registry name") and the Docker image ("image name") in the palette.

    - Then, the deployment will start. You can check the log terminal for the latest progress. (Note that pushing the Docker image might take about 4~5 minutes.)

    - After successfully deploying the Knative service, the service name will be printed in the log terminal and you can use it with `aksm.describeKnService` or `aksm.listKnServices` to check the service details. 

5. To get the detailed information about the Knative service we just deployed, execute `aksm.describeKnService` in the VS Code palette.

    - You will need to specify the name of the Knative service ("service name") in the palette.

    - You can also get the detailed information about all Knative services with `aksm.listKnServices`.

6. Several steps to test whether the deployment truly succeeds.

    - Check Docker Hub / execute `docker images` to check whether the specified Docker image is successfully pushed to the specified registry. 

    - Execute `kn service list` or `kubectl get ksvc` to check whether the Knative service is successfully deployed.

    - Use Postman to conduct API tests on the Knative service's URL to check whether the Flask app is running properly.   

7. To delete a Knative service, execute `aksm.deleteKnService` in the VS Code palette.

    - You will need to specify the name of the Knative service ("service name") in the palette.

## Relevant Tools

- Kubernetes: https://kubernetes.io/

- Knative: https://knative.dev/

- Docker: https://www.docker.com/

- Flask: https://flask.palletsprojects.com/en/3.0.x/

- Yeoman Generator: https://yeoman.io/

- Hugging Face: https://huggingface.co/models

## Release Notes

### 1.0.0

Initial release of "Automatic Manipulation on Knative Service". 

### 1.0.1

Print real-time messages to the user's terminal for the latest progress. 

### 1.1.0

The generated Dockerfile now installs dependencies based on the dependency file `requirements.txt` provided by the user. 

Rename commands `Deploy Service` -> `Deploy Knative Service`, `Get Service Info` -> `Describe Knative Service`, `Delete Service` -> `Delete Knative Service`, `Test Extension` -> `Test AKSM`.

Add a new command `Describe All Knative Services`. 

Update quickstart.

### 1.2.0

Replace usages of `kubectl` with `kn`.

Rename commands `Deploy Knative Service` -> `aksm.deployKnService`, `Describe Knative Service` -> `aksm.describeKnService`, `Delete Knative Service` -> `aksm.deleteKnService`, `Test AKSM` -> `aksm.testExtension`.

Update logs information.
